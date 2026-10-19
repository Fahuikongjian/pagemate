export type Rect = { x: number; y: number; width: number; height: number };
export type Annotation = {
  id: string;
  page: number;
  kind: "highlight" | "note" | "ink";
  text: string;
  quote?: string;
  rects: Rect[];
  points?: { x: number; y: number }[];
  color: string;
  createdAt: string;
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  quote?: string;
  status?: "streaming" | "complete" | "interrupted" | "error";
  createdAt: string;
};
export type StudyPage = {
  number: number;
  title: string;
  text: string;
  width: number;
  height: number;
  messages: Message[];
  annotations: Annotation[];
};
export type StudyDocument = {
  id: string;
  name: string;
  type: string;
  pageCount: number;
  currentPage: number;
  createdAt: string;
  updatedAt: string;
  pages: StudyPage[];
  demo?: boolean;
};
export type Status = {
  configured: boolean;
  model: string;
  conversion: string;
  version: string;
  lanUrls: string[];
};
