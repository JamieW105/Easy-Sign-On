export type Participant = {
  id: string;
  helmName: string;
  className?: string;
  sailNo?: string;
  altSailNo?: string;
  club?: string;
  isVisitor?: boolean;
  isNewSailor?: boolean;
  raw?: Record<string, unknown>;
};

export type PublicParticipant = Omit<Participant, "raw">;

export type SignAction = "sign_on" | "sign_off";
export type SignRecordAction = SignAction | "retire";

export type SignTimeWindowState =
  | "open"
  | "closing_soon"
  | "closed"
  | "overridden";

export type SignTimeWindowStatus = {
  state: SignTimeWindowState;
  label: string;
  message: string;
  isAcceptingSignOns: boolean;
  isOverrideActive: boolean;
  openTime: string;
  closeTime: string;
  timeZone: string;
};

export type SignRecord = {
  id: string;
  action: SignRecordAction;
  participantId: string;
  helmName: string;
  className?: string;
  sailNo?: string;
  altSailNo?: string;
  club?: string;
  isVisitor?: boolean;
  isNewSailor?: boolean;
  late?: boolean;
  retired?: boolean;
  roOverride?: boolean;
  timeWindowState?: SignTimeWindowState;
  timestamp: string;
  source: "tablet" | "web";
};

export type ParticipantsResponse = {
  participants: PublicParticipant[];
  source: {
    loaded: boolean;
    lastModified: string | null;
  };
  settings?: RoSettings;
};

export type TodaySailor = {
  participantId: string;
  helmName: string;
  className?: string;
  sailNo?: string;
  club?: string;
  isVisitor?: boolean;
  isNewSailor?: boolean;
  late?: boolean;
  roOverride?: boolean;
  retired?: boolean;
  signOnTime: string;
  signOffTime?: string;
  status: "signed_on" | "signed_off" | "retired";
};

export type SignRecordsSummary = {
  totalRecords: number;
  signedOn: number;
  signedOff: number;
  retired: number;
  visitors: number;
  newSailors: number;
  lateSignOns: number;
};

export type RoSettings = {
  signOnOverrideOpen: boolean;
  regattaMode: boolean;
  openTime: string;
  closeTime: string;
  clubName: string;
  language: SupportedLanguage;
  seasonSailwaveFile: string;
  iconUpdatedAt: string | null;
  updatedAt: string | null;
};

export const supportedLanguages = [
  "en",
  "es",
  "fr",
  "de",
  "ru",
  "uk",
  "zh-CN",
  "zh-HK",
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export type SignRecordsResponse = {
  records: SignRecord[];
  today: TodaySailor[];
  summary: SignRecordsSummary;
  timeWindow: SignTimeWindowStatus;
  settings: RoSettings;
};
