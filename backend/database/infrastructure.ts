import { AttributeType, Table, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { App, Stack, RemovalPolicy } from 'aws-cdk-lib';


export interface PartitionKey  {
    name: string,
    type: AttributeType
  }


export class Database extends Stack {

    public readonly table: Table;
    public readonly partitionKey : PartitionKey = {
            name: 'itemId',
            type: AttributeType.STRING
        }

    constructor(app: App, id: string) {
        super(app, id);


        this.table = new Table(this, 'items', {
            partitionKey : this.partitionKey,
            tableName: 'items',
            removalPolicy: RemovalPolicy.DESTROY, // NOT recommended for production code
            billingMode: BillingMode.PAY_PER_REQUEST
        });
    }
}