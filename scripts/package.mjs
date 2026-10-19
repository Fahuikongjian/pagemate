import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// Windows packaging uses Python's stdlib zipfile. No data, runtime secrets or dependencies are included.
const project = path.resolve('.');
const output = path.resolve('..', '页伴-PageMate.zip');
const script = `import os,zipfile,sys
root,out=sys.argv[1:]
ignored={'node_modules','data','.git','test-results','playwright-report','__pycache__'}
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
 for base,dirs,files in os.walk(root):
  dirs[:]=[d for d in dirs if d not in ignored]
  for name in files:
   if name=='.env' or name.endswith('.log') or name=='server.pid':continue
   full=os.path.join(base,name)
   archive.write(full,os.path.join('pagemate',os.path.relpath(full,root)))
print(out)
`;
const result = spawnSync('python', ['-c', script, project, output], { encoding: 'utf8', windowsHide: true });
if (result.status !== 0) throw new Error(result.stderr);
console.log(output, `(${(fs.statSync(output).size / 1024 / 1024).toFixed(2)} MB)`);
