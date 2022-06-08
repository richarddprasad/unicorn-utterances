export * from "./LicenseInfo";
export * from "./CollectionInfo";
export * from "./PostInfo";
export * from "./PronounInfo";
export * from "./RolesInfo";
export * from "./UnicornInfo";
import { languages } from "constants/index";

export type Languages = keyof typeof languages;
