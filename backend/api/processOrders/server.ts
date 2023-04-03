'use strict';

import { MyMeter } from './meter';
const my_meter = new MyMeter();

import { DynamoDB } from 'aws-sdk';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { v4 as uuidv4 } from 'uuid';
import { context, SpanKind } from '@opentelemetry/api';


//tracing 
import * as api from '@opentelemetry/api';
import { MyTracer } from './tracer';
import { AWSXRayPropagator } from '@aws/otel-aws-xray-propagator';


const my_tracer = new MyTracer();
my_tracer.start();

api.propagation.setGlobalPropagator(new AWSXRayPropagator());

const tracer = api.trace.getTracer('js-sample-app-tracer');



const QUEUE_URL = process.env.QUEUE_URL || 'default';
const TABLE_NAME = process.env.TABLE_NAME || '';
const PRIMARY_KEY = process.env.PRIMARY_KEY || '';
const db = new DynamoDB.DocumentClient();
const sqs = new SQSClient({ region: 'eu-west-3' })

const RESERVED_RESPONSE = `Error: You're using AWS reserved keywords as attributes`,
  DYNAMODB_EXECUTION_ERROR = `Error: Execution update, caused a Dynamodb error, please take a look at your CloudWatch Logs.`;

const params = {
  AttributeNames: [
    "SentTimestamp"
  ],
  MaxNumberOfMessages: 10,
  MessageAttributeNames: [
    "All"
  ],
  QueueUrl: QUEUE_URL,
  VisibilityTimeout: 20,
  WaitTimeSeconds: 0
};

const getMessages = async () => {
  //console.log("geting Messages...");

  try {
    const data = await sqs.send(new ReceiveMessageCommand(params));
    if (data.Messages) {
      for (const message of data.Messages) {
        await processMessage(message);
      }


      const deleteParams = {
        QueueUrl: QUEUE_URL,
        ReceiptHandle: data.Messages[0].ReceiptHandle,
      };

      try {

        const data = await sqs.send(new DeleteMessageCommand(deleteParams));
        console.log("Message deleted in SQS");



      } catch (err) {
        console.log("Error", err);

      }
    } else {
      //console.log("No messages to delete");
    }
  } catch (err) {
    console.log("Receive Error", err);

  } finally {
    setTimeout(getMessages, 2000);
  }
};

setTimeout(getMessages, 2000);



function extractIdsFromXRay(xAmznTraceId) {
  const parts = xAmznTraceId.split(';');
  const rootPart = parts.find(part => part.startsWith('Root='));
  const parentIdPart = parts.find(part => part.startsWith('Parent='));
  if (!rootPart || !parentIdPart) {
    return {};
  }
  const version = '00-';
  const traceId = version + rootPart.substring(5).padStart(32, '0');
  const parentid = parentIdPart.substring(7);
  return { traceId, parentid };
}

function generateUniqueId() {
  return uuidv4().replace(/-/g, '');
}
function getTraceIdFromXRay(str) {
  const regex = /Root=1-(\w+)-/;
  const match = str.match(regex);
  if (match) {
    return match[1] + str.substr(match.index + match[0].length, 24);
  } else {
    return null;
  }
}




async function processMessage(message) {

  // Extract trace attributes
  const xAmznTraceId = message.MessageAttributes['x-amzn-trace-id'].StringValue;

  //get traceID and span parent ID from xAmznTraceId
  const xRayTraceparent = getTraceIdFromXRay(xAmznTraceId);
  const { parentid } = extractIdsFromXRay(xAmznTraceId);

  //const xRayTraceparent = traceId;
  const common_span_attributes = { signal: 'trace', language: 'javascript', 'trace_id': xRayTraceparent };

  //create Span Context for parent Span with parent spanID and traceID
  const parentSpanContext: api.SpanContext = {
    traceId: xRayTraceparent || "64295a215e481933696ea0c90926a67c",
    spanId: parentid,
    traceFlags: 1
  };

  //create span options with a link to the parent span context
  const spanOptions: api.SpanOptions = {
    attributes: common_span_attributes,
    kind: SpanKind.SERVER,
  };


  const parentContext = api.trace.setSpanContext(api.ROOT_CONTEXT, parentSpanContext);

  //run code with active context
  api.context.with(parentContext, async () => {
    //log new span traceId
    const span = tracer.startSpan('process_sqs_message', spanOptions);
    console.log(`new span traceID: ${span.spanContext().traceId}`);

    await api.context.with(api.trace.setSpan(api.context.active(), span), async () => {

      try {

        try {
          message.Body = message.Body === undefined ? "{}" : message.Body;
          const item = typeof message.Body == 'object' ? message.Body : JSON.parse(message.Body);
          item[PRIMARY_KEY] = uuidv4();
          const params = {
            TableName: TABLE_NAME,
            Item: item
          };

          logWithTrace('adding metric');
          item.qty = item.qty === undefined ? "-1" : item.qty;
          item.price = item.price === undefined ? "-1" : item.price;
          item.stockname = item.stockname === undefined ? "anycompany-" : item.stockname;



          const dynamoSpan = tracer.startSpan('DynamoDB query', spanOptions);
          await api.context.with(api.trace.setSpan(api.context.active(), dynamoSpan), async () => {

            try {

              await db.put(params).promise();
              logWithTrace('item added into DynamoDB')
              my_meter.emitsStockdMetric(item.qty, item.stockname);
              my_meter.emitPriceMetric(item.price, item.stockname);


            } catch (dbError) {
              const errorResponse = dbError.code === 'ValidationException' && dbError.message.includes('reserved keyword') ?
                DYNAMODB_EXECUTION_ERROR : RESERVED_RESPONSE;
              console.log("statusCode: 500, body:", dbError);
            }
            dynamoSpan.end()
          });


        } catch (err) {
          console.log("error processsing message:", err);

        }
      } catch (error) {


        console.error('Error processing message:', error);

        // Définir les attributs d'erreur pour le span
        span.recordException(error);
        span.setAttribute('error.type', error.constructor.name);
        span.setAttribute('error.stack', error.stack);

      }
      span.end();

    });
  });

}

function logWithTrace(message) {
  const span = api.trace.getSpan(context.active());
  if (span) {
    const spanContext = span.spanContext();
    const traceId = spanContext.traceId;
    const spanId = spanContext.spanId;
    console.log(`[TraceID: ${traceId}, SpanID: ${spanId}] ${message}`);
  } else {
    console.log(message);
  }
}