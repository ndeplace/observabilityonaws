'use strict';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const stockpriceMetricName = 'stock-prices';
const stockorderedMetricName = 'stocks-qty';


/** The OTLP Metrics Provider with OTLP HTTP Metric Exporter and Metrics collection Interval  */
const exporter = new OTLPMetricExporter();
const meterProvider = new MeterProvider({});

meterProvider.addMetricReader(new PeriodicExportingMetricReader({
  exporter: exporter,
  exportIntervalMillis: 1000,
}));

const meter = meterProvider.getMeter('stock-info');

export class MyMeter {

  private stockMetric: any;
  private priceMetric: any;

  constructor() {

    this.stockMetric = meter.createCounter(stockorderedMetricName, { description: 'Metric for counting stock order', unit: '1' });
    this.priceMetric = meter.createHistogram(stockpriceMetricName, { description: 'Metric for record order price', unit: '$' });

  }

  //** emitsStockdMetric() Count number of stock ordered */
  public emitsStockdMetric(qty, stockname: string) {
    this.stockMetric.add(qty, { 'stockQty': stockname });
  }

  //** emitPriceMetric record price for each order validated */
  public emitPriceMetric(price, stockName: string) {
    const labels = { 'stockName': stockName };
    this.priceMetric.record(price, labels);
  }

}


