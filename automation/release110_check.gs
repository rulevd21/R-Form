// Release acceptance: signed reads and private owner menu; no content writes/publication.
function rformRelease110Verify() {
 const p=PropertiesService.getScriptProperties();
 const bundle=rformOwnerBotV1ApiRead_();
 const report={event:'RELEASE_110_READBACK',version:RFORM_OWNER_BOT_V1.version,apiVersion:bundle.version,autoDraftEnabled:p.getProperty('RFORM_OWNER_AUTO_DRAFTS_ENABLED'),queueRows:bundle.queue.length,work:rformOwnerBotV1WorkspaceRows_(bundle.queue,'work','').length,held:rformOwnerBotV1WorkspaceRows_(bundle.queue,'held','').length,published:rformOwnerBotV1WorkspaceRows_(bundle.queue,'published','').length,pollTriggers:ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='rformOwnerBotV1Poll').length,publicationPerformed:false};
 console.log(JSON.stringify(report));
 rformOwnerBotV1WorkspaceMenu_();
 console.log(JSON.stringify({event:'RELEASE_110_OWNER_MENU_SENT',publicationPerformed:false}));
}
