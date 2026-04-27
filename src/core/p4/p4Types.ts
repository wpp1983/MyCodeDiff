export type P4CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type P4CommandRunner = (args: string[]) => Promise<P4CommandResult>;

export type P4InfoFields = {
  user?: string;
  client?: string;
  clientRoot?: string;
  serverAddress?: string;
  serverVersion?: string;
};

export type P4ClientView = {
  clientName: string;
  depotPaths: string[];
  mappings: Array<{ depotPath: string; clientPath: string; exclude: boolean }>;
};
