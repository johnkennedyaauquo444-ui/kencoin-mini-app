import fs from "node:fs";
import vm from "node:vm";
const html=fs.readFileSync("index.html","utf8");
const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
if(!scripts.length)throw new Error("No inline JavaScript blocks found in index.html");
for(let i=0;i<scripts.length;i++)new vm.Script(scripts[i],{filename:"index.html:inline-script-"+(i+1)});
console.log("Checked "+scripts.length+" inline script block(s).");
