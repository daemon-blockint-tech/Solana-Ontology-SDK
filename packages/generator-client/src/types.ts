export interface ClientGenConfig {
  outputDir: string;
  /** Package name for the generated client */
  packageName: string;
  /** Whether to generate React hooks */
  generateReact: boolean;
  /** Whether to generate query builders */
  generateQueries: boolean;
}

export interface GeneratedClientFile {
  path: string;
  content: string;
}
