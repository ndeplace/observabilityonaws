
import { App } from 'aws-cdk-lib';


import { Database } from './database/infrastructure';
import{ApiLambdaStack} from './api/orders/infrastructure'
import {WorkerECSStack} from './api/processOrders/infrastructure'
//cdk main application stack


const app = new App();







const database = new Database(app, 'Database');

const apiLambdaStack = new ApiLambdaStack(app, "ApiLambdaStack");

new WorkerECSStack(app, 'WorkerECSStack',{queue: apiLambdaStack.queue,dynamodb_table: database.table,
    dynamodb_table_partition_key: database.partitionKey});



app.synth();
