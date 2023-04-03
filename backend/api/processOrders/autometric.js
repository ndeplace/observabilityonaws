const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const collectorOptions = {
  //url: 'http://localhost:4318', // url is optional and can be omitted - default is http://localhost:4318/v1/metrics
  concurrencyLimit: 1, // an optional limit on pending requests
};
const exporter = new OTLPMetricExporter(collectorOptions);
const meterProvider = new MeterProvider({});

meterProvider.addMetricReader(new PeriodicExportingMetricReader({
  exporter: exporter,
  exportIntervalMillis: 1000,
}));

// Now, start recording data
const meter = meterProvider.getMeter('example-meter');
const counter = meter.createCounter('metric_name');
counter.add(10, { 'stockoption': 'coca' });

