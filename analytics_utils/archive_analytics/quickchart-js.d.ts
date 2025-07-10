// quickchart-js.d.ts
declare module "quickchart-js" {
  export default class QuickChart {
    constructor();
    setConfig(config: object): QuickChart;
    getShortUrl(): Promise<string>;
  }
}
