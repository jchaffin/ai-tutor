declare module '@jchaffin/pdf-parse' {
  interface Result {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: string;
    text: string;
  }

  function pdfParse(dataBuffer: Buffer): Promise<Result>;
  export = pdfParse;
}
