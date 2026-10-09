// Release acceptance: signed reads and private owner menu; no content writes/publication.
function rformRelease110Verify() {
 const p=PropertiesService.getScriptProperties();
 const bundle=rformOwnerBotV1ApiRead_();
 const report={event:'RELEASE_110_READBACK',version:RFORM_OWNER_BOT_V1.version,apiVersion:bundle.version,autoDraftEnabled:p.getProperty('RFORM_OWNER_AUTO_DRAFTS_ENABLED'),queueRows:bundle.queue.length,work:rformOwnerBotV1WorkspaceRows_(bundle.queue,'work','').length,held:rformOwnerBotV1WorkspaceRows_(bundle.queue,'held','').length,published:rformOwnerBotV1WorkspaceRows_(bundle.queue,'published','').length,pollTriggers:ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='rformOwnerBotV1Poll').length,publicationPerformed:false};
 console.log(JSON.stringify(report));
 rformOwnerBotV1WorkspaceMenu_();
 console.log(JSON.stringify({event:'RELEASE_110_OWNER_MENU_SENT',publicationPerformed:false}));
}

function rformRelease122OwnerViews() {
 const b=rformOwnerBotV1ApiRead_();
 rformOwnerBotV1AiQueue_(b,0);rformOwnerBotV1Status_();
 console.log(JSON.stringify({event:"RELEASE_122_OWNER_VIEWS",version:RFORM_OWNER_BOT_V1.version,apiVersion:b.version,aiMaterials:b.queue.filter(q=>!!((b.workspace_meta||{})[q.Content_ID]||{}).ai).length,privateViewsSent:["ai","status"],publicationPerformed:false,canonicalWrite:false}));
}
