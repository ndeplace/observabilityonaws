import * as cdk from 'aws-cdk-lib';
import { App, StackProps, RemovalPolicy, aws_iam, Duration } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';
import * as ecrdeploy from 'cdk-ecr-deployment';
//import * as iam from 'aws-cdk-lib/aws-iam';
import * as alb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { PartitionKey } from '../../database/infrastructure'

// extend the props of the stack by adding the dynamoDB table from the backend
export interface OrderProcessingProps extends StackProps {
  queue: sqs.IQueue,
  dynamodb_table: Table,
  dynamodb_table_partition_key: PartitionKey,
}

export class WorkerECSStack extends cdk.Stack {
  constructor(app: App, id: string, props: OrderProcessingProps) {
    super(app, id, props);

    // Build docker image
    const asset = new DockerImageAsset(this, 'MyBuildImage', {
      directory: path.join("api/orders", ''),
    });
    // Create ECR repository
    const ecrRepo = new ecr.Repository(this, 'WebserverEcrRep', {
      repositoryName: 'worker-ecr-rep',
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Deploy docker image to ECR
    new ecrdeploy.ECRDeployment(this, 'DeployImage', {
      src: new ecrdeploy.DockerImageName(asset.imageUri),
      dest: new ecrdeploy.DockerImageName(`${cdk.Aws.ACCOUNT_ID}.dkr.ecr.eu-west-3.amazonaws.com/worker-ecr-rep:latest`),
    });
    // Create ECS cluster
    const cluster = new ecs.Cluster(this, 'OrderProcessingCluster', {
      clusterName: 'orderProcessing-cluster',
    });


    const taskRole = new aws_iam.Role(this, "RoleSvc", {
      assumedBy: new aws_iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    taskRole.addManagedPolicy({
      managedPolicyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
    });

    //grant queue write permissions

    taskRole.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        resources: [props.queue.queueArn],
        actions: [
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl",
          "sqs:DeleteMessage",
          "sqs:ReceiveMessage"
        ]
      })
    )




    // create a policy statement to write metrics 
    taskRole.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ['cloudwatch:StartMetricStreams', 'cloudwatch:StopMetricStreams', 'cloudwatch:PutMetricStream', 'cloudwatch:PutMetricData', 'cloudwatch:ListMetricStreams'],
        resources: ['*']
      })
    )


    // create a policy statement to write logs and trace 
    taskRole.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: [
          "logs:PutLogEvents",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogStreams",
          "logs:DescribeLogGroups",
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets",
          "xray:GetSamplingStatisticSummaries",
          "ssm:GetParameters",
        ],
        resources: ["*"],
      })
    );




    // Create ECS task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'OrderProcessingTaskDef', {
      memoryLimitMiB: 4096,
      cpu: 2048,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
      },
      taskRole: taskRole
    });




    props.dynamodb_table.grantReadWriteData(taskDefinition.taskRole);


    // Create ECS worker container definition
    const _workerContainer = taskDefinition.addContainer('OrderProcessingContainer', {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepo),
      /*    memoryLimitMiB: 4096,
         cpu: 2048, */
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'orderProcessing-ecs',
      }),
      portMappings: [
        {
          containerPort: 80,
          hostPort: 80,
        },
      ],
      environment: {
        "QUEUE_URL": props.queue.queueUrl,
        "PRIMARY_KEY": props.dynamodb_table_partition_key.name,
        "TABLE_NAME": props.dynamodb_table.tableName,
        "OTEL_EXPORTER_OTLP_ENDPOINT":"http://localhost:4318",
        "OTEL_RESOURCE_ATTRIBUTES":"service.name=ECSWorkerProcessing",
        "OTEL_PROPAGATORS":"xray",
        "ECS_AVAILABLE_LOGGING_DRIVERS":'["json-file","awslogs"]'
      }
    });




    // Create OTEL container definition
    const _otelContainer = taskDefinition.addContainer("Otel", {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-observability/aws-otel-collector:latest'),
      logging: new ecs.AwsLogDriver({ streamPrefix: 'ServiceBOtel', mode: ecs.AwsLogDriverMode.NON_BLOCKING }),
      command: ['--config=/etc/ecs/container-insights/otel-task-metrics-config.yaml'],
      essential: false,
      memoryLimitMiB: 512,
      cpu: 1024,
      portMappings: [
        {
          containerPort: 4317,
          hostPort: 4317,
          protocol: ecs.Protocol.UDP,
        },
        {
          containerPort: 4318,
          hostPort: 4318,
          protocol: ecs.Protocol.UDP,
        },
        {
          containerPort: 2000, //xray port
          hostPort: 2000,
          protocol: ecs.Protocol.UDP,
        },
        {
          containerPort: 13133, //healthcheck
          hostPort: 13133,
          protocol: ecs.Protocol.TCP,
        }
      ],
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://127.0.0.1:13133/ || exit 1"],
        timeout: Duration.seconds(10),
        startPeriod: Duration.seconds(10),
      }
    });





    // Create ECS service
    const service = new ecs.FargateService(this, 'OrderProcessingService', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      serviceName: 'orderProcessing-service',
      assignPublicIp: true,
    });



    /*           // Create ECS load balancer
        const loadBalancer = new alb.ApplicationLoadBalancer(this, 'OrderProcessingLoadBalancer', {
            vpc: cluster.vpc,
            internetFacing: true,
          });
      
          // Create ECS listener
          const listener = loadBalancer.addListener('OrderProcessingListener', {
            port: 80,
          });
      
          // Create ECS target group
          const _targetGroup = listener.addTargets('OrderProcessingTargetGroup', {
            port: 80,
            targets: [service],
            healthCheck: {
              path: '/',
              interval: cdk.Duration.seconds(60),
              timeout: cdk.Duration.seconds(5),
              healthyHttpCodes: '200',
            },
          }); */


    // Create ECS security group
    const securityGroup = new ec2.SecurityGroup(this, 'OrderProcessingSecurityGroup', {
      vpc: cluster.vpc,
      allowAllOutbound: true,
    });

    // Create ECS security group ingress rule
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP access from the Internet');

    // Create ECS security group egress rule
    securityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP access to the Internet');

  }
}
