
import { LayerVersion, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { join } from 'path';
import { IResource, LambdaIntegration, MockIntegration, PassthroughBehavior, RestApi } from 'aws-cdk-lib/aws-apigateway';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Constants } from '../../constants';




export class ApiLambdaStack extends Stack {

  public readonly queue: sqs.Queue;

  constructor(app: App, id: string) {
    super(app, id);



    this.queue = new sqs.Queue(this, Constants.QUEUE_NAME);


    const OtelLayer = LayerVersion.fromLayerVersionArn(
      this,
      "Otel",
      "arn:aws:lambda:eu-west-3:901920570463:layer:aws-otel-nodejs-amd64-ver-1-9-1:2"
    )


    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        externalModules: [
          'aws-sdk', // Use the 'aws-sdk' available in the Lambda runtime
        ],
      },
      depsLockFilePath: join(__dirname, 'runtime', 'package-lock.json'),
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: "/opt/otel-handler",
        QUEUE_URL: this.queue.queueUrl,
        NODE_OPTIONS: '--trace-warnings'
      },
      runtime: Runtime.NODEJS_14_X,
      layers: [OtelLayer],
      tracing: Tracing.ACTIVE
    }

    // Create a Lambda function for each of the CRUD operations


    const LambdaStack = new NodejsFunction(this, 'postOrderFunction', {
      entry: join(__dirname, 'runtime', 'index.ts'),
      ...nodeJsFunctionProps,
    });

    // create a policy statement to write xray traces
    const XRayAccessPolicy = new iam.PolicyStatement({
      actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords', 'xray:GetSamplingRules', 'xray:GetSamplingTargets', 'xray:GetSamplingStatisticSummaries'],
      resources: ['*'],
      effect: iam.Effect.ALLOW
    });



    //allow tracing into X ray & cloudwatch
    LambdaStack.role?.attachInlinePolicy(
      new iam.Policy(this, 'trace into xray', {
        statements: [XRayAccessPolicy],
      })
    )

    //Grant the Lambda function write access to the SQS Queue
    this.queue.grantSendMessages(LambdaStack);

    // Integrate the Lambda functions with the API Gateway resource
    const AllLambdaIntegration = new LambdaIntegration(LambdaStack);

    // Create an API Gateway resource for each of the CRUD operations
    const api = new RestApi(this, 'ordersApi', {
      restApiName: 'Orders Service'
    });

    const items = api.root.addResource('orders');
    items.addMethod('GET', AllLambdaIntegration);
    items.addMethod('POST', AllLambdaIntegration);
    addCorsOptions(items);

    const singleItem = items.addResource('{id}');
    singleItem.addMethod('GET', AllLambdaIntegration);
    singleItem.addMethod('PATCH', AllLambdaIntegration);
    singleItem.addMethod('DELETE', AllLambdaIntegration);
    addCorsOptions(singleItem);

  }



}


export function addCorsOptions(apiResource: IResource) {
  apiResource.addMethod('OPTIONS', new MockIntegration({
    integrationResponses: [{
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
        'method.response.header.Access-Control-Allow-Origin': "'*'",
        'method.response.header.Access-Control-Allow-Credentials': "'false'",
        'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,GET,PUT,POST,DELETE'",
      },
    }],
    passthroughBehavior: PassthroughBehavior.NEVER,
    requestTemplates: {
      "application/json": "{\"statusCode\": 200}"
    },
  }), {
    methodResponses: [{
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Headers': true,
        'method.response.header.Access-Control-Allow-Methods': true,
        'method.response.header.Access-Control-Allow-Credentials': true,
        'method.response.header.Access-Control-Allow-Origin': true,
      },
    }]
  })
}


