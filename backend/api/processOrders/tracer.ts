const process = require('process');
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { AWSXRayPropagator } from "@opentelemetry/propagator-aws-xray";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { AwsInstrumentation } from "@opentelemetry/instrumentation-aws-sdk";


const _resource = Resource.default().merge(new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "processing-worker",
}));
const _traceExporter = new OTLPTraceExporter();
const _spanProcessor = new BatchSpanProcessor(_traceExporter);
const _tracerConfig = {

}

export class MyTracer {

    public async start() {
        const sdk = new NodeSDK({
            textMapPropagator: new AWSXRayPropagator(),
            instrumentations: [
                new HttpInstrumentation(),
                new AwsInstrumentation({
                    suppressInternalInstrumentation: true,
                }),
            ],
            resource: _resource,
            spanProcessor: _spanProcessor,
            traceExporter: _traceExporter,
        });
        sdk.configureTracerProvider(_tracerConfig, _spanProcessor);

        // this enables the API to record telemetry
        await sdk.start();
        // gracefully shut down the SDK on process exit
        process.on('SIGTERM', () => {
            sdk.shutdown()
                .then(() => console.log('Tracing and Metrics terminated'))
                .catch((error) => console.log('Error terminating tracing and metrics', error))
                .finally(() => process.exit(0));
        });
    }
}