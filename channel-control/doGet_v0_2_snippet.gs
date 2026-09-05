// Replace the existing doGet() in Code.gs with this function after adding PreviewAddon.html.
function doGet() {
  const base = HtmlService.createTemplateFromFile('Index').evaluate().getContent();
  const addon = HtmlService.createHtmlOutputFromFile('PreviewAddon').getContent();
  const html = base.replace('</body>', addon + '\n</body>');
  return HtmlService.createHtmlOutput(html)
    .setTitle('R/Form · Channel Control')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
