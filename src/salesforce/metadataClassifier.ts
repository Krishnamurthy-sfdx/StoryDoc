import type { ChangedFile } from "../schemas.js";

export type SalesforceMetadata = { path: string; component: string; metadataType: string; changeType: ChangedFile["status"] };

const rules = [
  ["/classes/", "ApexClass", classComponent], ["/triggers/", "ApexTrigger", classComponent],
  ["/lwc/", "LightningWebComponent", folderComponent], ["/aura/", "AuraComponent", folderComponent],
  ["/flows/", "Flow", xmlComponent], ["/permissionsets/", "PermissionSet", xmlComponent],
  ["/objects/", "SalesforceObjectConfiguration", folderComponent], ["/customMetadata/", "CustomMetadata", xmlComponent],
  ["/layouts/", "Layout", xmlComponent], ["/profiles/", "Profile", xmlComponent], ["/tabs/", "CustomTab", xmlComponent],
] as const;

export function classifySalesforceFile(file: ChangedFile): SalesforceMetadata {
  const normalized = `/${file.path.replaceAll("\\", "/")}`;
  const rule = rules.find(([directory]) => normalized.includes(directory));
  if (!rule) return { path: file.path, component: file.path.split("/").at(-1) ?? file.path, metadataType: "OtherSalesforceMetadata", changeType: file.status };
  return { path: file.path, component: rule[2](normalized), metadataType: rule[1], changeType: file.status };
}

function withoutMetadataSuffix(value: string): string { return value.replace(/\.[^.]+-meta\.xml$|\.meta\.xml$|\.xml$|\.[^.]+$/, ""); }
function classComponent(path: string): string { return withoutMetadataSuffix(path.split("/").at(-1) ?? path); }
function xmlComponent(path: string): string { return withoutMetadataSuffix(path.split("/").at(-1) ?? path); }
function folderComponent(path: string): string { const parts = path.split("/"); const index = Math.max(parts.lastIndexOf("lwc"), parts.lastIndexOf("aura")); return parts[index + 1] ?? parts.at(-1) ?? path; }
export function classifyChangedFiles(files: ChangedFile[]): SalesforceMetadata[] { return files.map(classifySalesforceFile); }
