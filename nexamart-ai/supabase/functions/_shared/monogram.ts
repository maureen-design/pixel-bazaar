/**
 * HTML/CSS monogram for email templates.
 * Uses inline styles for maximum email client compatibility.
 * Includes text fallback for email clients that don't support SVG.
 */
export function getEmailMonogram(siteName: string = 'NexaMart AI'): string {
  return `
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" style="width:48px;height:48px;" arcsize="21%" fillcolor="#0B1A2B">
      <v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0">
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">NM</center>
      </v:textbox>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <div style="display:inline-block;position:relative;width:48px;height:48px;background:#0B1A2B;border-radius:10px;overflow:hidden;vertical-align:middle;text-align:center;line-height:48px;">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;position:absolute;top:0;left:0;">
        <rect width="64" height="64" rx="14" fill="#0B1A2B"/>
        <path d="M14 16v32M14 16l22 32M36 16v32" stroke="#2563EB" stroke-width="4.5" stroke-linecap="square"/>
        <path d="M50 16v32M50 16L28 48M36 16v32" stroke="#D4A853" stroke-width="4.5" stroke-linecap="square"/>
        <rect x="33" y="29" width="6" height="6" rx="1" transform="rotate(45 36 32)" fill="#D4A853" opacity="0.5"/>
      </svg>
      <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);">NM</span>
    </div>
    <!--<![endif]-->
  `;
}

/**
 * Full email header with monogram + site name.
 */
export function getEmailHeader(siteName: string = 'NexaMart AI'): string {
  return `
    <div style="text-align:center;padding:32px 32px 24px;">
      ${getEmailMonogram(siteName)}
      <p style="color:#94a3b8;font-size:14px;margin:8px 0 0;font-weight:500;letter-spacing:0.5px;">${siteName}</p>
    </div>
  `;
}
