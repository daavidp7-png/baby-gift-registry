export type ImageSyncFailureReason =
  | "fetch_failed"
  | "no_image"
  | "airtable_update_failed";

export type ImageSyncFailure = {
  giftName: string;
  reason: ImageSyncFailureReason;
};

export type ImageSyncResult = {
  checked: number;
  alreadyHadImage: number;
  imagesAdded: number;
  invalidProductUrl: number;
  fetchFailed: number;
  noImageFound: number;
  airtableUpdateFailed: number;
  failures: ImageSyncFailure[];
};
