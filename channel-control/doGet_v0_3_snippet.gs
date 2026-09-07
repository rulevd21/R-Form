// R/Form Channel Control v0.3.2: load base dashboard, preview UI, v0.3 UX, then schedule-edit add-on.
function doGet() {
  const base = HtmlService.createTemplateFromFile('Index').evaluate().getContent();
  const preview = HtmlService.createHtmlOutputFromFile('PreviewAddon').getContent();
  const ux = HtmlService.createHtmlOutputFromFile('ChannelControlUX_v0_3').getContent();
  const scheduleEdit = HtmlService.createHtmlOutputFromFile('ScheduleEditAddon_v0_3_2').getContent();
  const html = base.replace('</body>', preview + '\n' + ux + '\n' + scheduleEdit + '\n</body>');
  return HtmlService.createHtmlOutput(html)
    .setTitle('R/Form · Channel Control')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
