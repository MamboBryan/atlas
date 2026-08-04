export type SheetGrid = { headers: string[]; rows: string[][] };

export type DetectedMapping = {
  emailColumn: string;
  nameColumn: string | null;
  timestampColumn: string | null;
  questionColumns: string[];
};

export type NormalizedCandidate = {
  email: string;
  displayName: string;
  submittedAt: string | null;
  answers: { columnKey: string; text: string }[];
};

export type ImportSummary = {
  candidatesSeen: number;
  rowsSkipped: { reason: string; count: number }[];
  duplicateEmails: string[];
  questionColumns: string[];
};
