import fs from "node:fs";
import vm from "node:vm";
const html=fs.readFileSync("index.html","utf8");
let position=0,count=0;
while(true){
 const start=html.indexOf("<script",position);
 if(start<0)break;
 const openEnd=html.indexOf(">",start);
 if(openEnd<0)throw new Error("Unclosed script tag");
 const opening=html.slice(start,openEnd+1);
 const close=html.indexOf("</script>",openEnd+1);
 if(close<0)throw new Error("Missing closing script tag");
 const source=html.slice(openEnd+1,close);
 if(!opening.includes("src=")&&source.trim()){
  new vm.Script(source,{filename:"index.html:inline-script-"+(++count)});
 }
 position=close+9;
}
if(!count)throw new Error("No inline JavaScript blocks found in index.html");
console.log("Checked "+count+" inline script block(s).");
