export async function extractFile(file: File): Promise<string> {
  if(file.size>10*1024*1024) throw new Error("Choose a file smaller than 10 MB.");
  const ext=file.name.split(".").pop()?.toLowerCase();
  const bytes=await file.arrayBuffer();
  let text="";
  if(ext==="pdf"){
    const pdfjs=await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
    const pdf=await pdfjs.getDocument({data:bytes,isEvalSupported:false}).promise;
    try{
      if(pdf.numPages>200)throw new Error("Choose a PDF with 200 pages or fewer.");
      const pages=[];
      for(let n=1;n<=pdf.numPages;n++){
        const page=await pdf.getPage(n), content=await page.getTextContent();
        let pageText="";
        for(const item of content.items) if("str" in item) pageText+=item.str+(item.hasEOL?"\n":" ");
        pages.push(`[Page ${n}]\n${pageText.trim()}`);
      }
      text=pages.join("\n\n");
      if(text.replace(/\[Page \d+\]/g,"").trim().length<40)throw new Error("This PDF has no readable text. Use a text-based PDF, Word document, or paste the guidance below.");
    }finally{await pdf.destroy();}
  }else if(ext==="docx"){
    const mammoth=await import("mammoth/mammoth.browser");
    const result=await mammoth.convertToHtml({arrayBuffer:bytes});
    const doc=new DOMParser().parseFromString(result.value,"text/html");
    const walk=(node:Element):string=>{
      const tag=node.tagName.toLowerCase();
      if(/^h[1-6]$/.test(tag))return `${"#".repeat(Math.min(4,Number(tag[1])))} ${node.textContent?.trim()}\n\n`;
      if(tag==="p"||tag==="li")return `${tag==="li"?"• ":""}${node.textContent?.trim()}\n\n`;
      if(tag==="tr")return Array.from(node.children).map(n=>n.textContent?.trim()).join(" | ")+"\n\n";
      return Array.from(node.children).map(walk).join("");
    };
    text=walk(doc.body);
  }else if(ext==="txt"||ext==="md")text=new TextDecoder("utf-8",{fatal:false}).decode(bytes);
  else throw new Error("Use PDF, Word (.docx), text (.txt), or Markdown (.md).");
  if(text.trim().length<40)throw new Error("The file needs at least 40 characters of readable guidance.");
  if(text.length>240000)throw new Error("This guidance is too long. Split it into shorter guides (up to 240,000 characters each).");
  return text.trim();
}
