import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
const exec = promisify(execFile);
const office =
  process.env.LIBREOFFICE_PATH ||
  (process.platform === "win32"
    ? "C:\\Program Files\\LibreOffice\\program\\soffice.exe"
    : "/usr/bin/soffice");
export const conversion = existsSync(office)
  ? "LibreOffice"
  : process.platform === "win32" &&
      existsSync(
        "C:\\Program Files\\Microsoft Office\\root\\Office16\\POWERPNT.EXE",
      )
    ? "PowerPoint"
    : "";
export async function convertPpt(input: string, output: string) {
  if (!conversion)
    throw new Error(
      "PPT 转换需要 LibreOffice 或 Windows PowerPoint。安装后重启服务，或先把课件另存为 PDF。",
    );
  if (conversion === "LibreOffice") {
    const profile = `file:///${path.dirname(input).replace(/\\/g, "/")}/lo-profile`;
    await exec(
      office,
      [
        `-env:UserInstallation=${profile}`,
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        path.dirname(output),
        input,
      ],
      { timeout: 120000, windowsHide: true },
    );
  } else {
    await exec(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.resolve("server/convert-ppt.ps1"),
        "-InputFile",
        input,
        "-OutputFile",
        output,
      ],
      { timeout: 120000, windowsHide: true },
    );
  }
  if (!existsSync(output))
    throw new Error(
      "课件没有成功转换。请检查文件是否加密，或在 PowerPoint 中另存为 PDF 后打开。",
    );
}
