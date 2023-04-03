import * as AWS from 'aws-sdk';
import api from '@opentelemetry/api';
import { AWSXRayPropagator } from '@opentelemetry/propagator-aws-xray';

const QUEUE_URL = process.env.QUEUE_URL || '';
// Create an SQS service object
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });


const handler = async (event: any = {}): Promise<any> => {

  if (!event.body) {
    return { statusCode: 400, body: 'invalid request, you are missing the parameter body' };
  }

  console.log("request to lambda: " + JSON.stringify(event));
  const item = typeof event.body == 'object' ? event.body : JSON.parse(event.body);
  if (!item.stockname) {
    return { statusCode: 422, body: 'missing attribute strockname' };
  } else if (!item.from) {
    return { statusCode: 422, body: 'missing attribute from' };
  } else if (!item.qty) {
    return { statusCode: 422, body: 'missing attribute qty' };
  } else if (!item.price) {
    return { statusCode: 422, body: 'missing attribute price' };
  }



  const sqsparams = {
    DelaySeconds: 2,
    MessageBody: JSON.stringify(item),
    QueueUrl: QUEUE_URL
  };




  return await sendMessage(sqsparams);
  

  
  

};





async function sendMessage(sqsparams) {
  let response: any;
  try {
    await sqs.sendMessage(sqsparams).promise();
    response = { statusCode: 201, body: '' };

  }
  catch (err) {
    console.log('Error: ', err.message);
    response = { statusCode: 500, body: err };
  }
  return response;
}

module.exports = { handler }