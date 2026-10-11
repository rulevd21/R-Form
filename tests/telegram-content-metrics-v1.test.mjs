import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../automation/telegram_content_metrics_v1.gs', import.meta.url), 'utf8');
const context = {console};
vm.createContext(context);
vm.runInContext(source, context);

const parseCount = context.rformTelegramMetricsParseCountV1;
const parsePost = context.rformTelegramMetricsParsePostHtmlV1;
const checkpoint = context.rformTelegramMetricsCheckpointV1;
const patch = context.rformTelegramMetricsCheckpointPatchV1;

test('compact Telegram counters are parsed deterministically', () => {
  assert.equal(parseCount('1.2K'), 1200);
  assert.equal(parseCount('1,5K'), 1500);
  assert.equal(parseCount('2M'), 2000000);
  assert.equal(parseCount('147'), 147);
  assert.equal(parseCount(''), null);
});

test('parser selects the exact public post and sums observed reactions only', () => {
  const html = `
    <div class="tgme_widget_message" data-post="r_form/78">
      <span class="tgme_widget_message_views">9.9K</span>
    </div>
    <div class="tgme_widget_message" data-post="r_form/79">
      <span class="tgme_widget_message_views">1.2K</span>
      <span class="tgme_widget_message_reaction_count">3</span>
      <span class="tgme_widget_message_reaction_count">2</span>
      <span class="tgme_widget_message_replies">4 comments</span>
    </div>
    <div class="tgme_widget_message" data-post="r_form/80">
      <span class="tgme_widget_message_views">8.8K</span>
    </div>`;
  const result = parsePost(html, 'r_form', '79');
  assert.equal(result.views, 1200);
  assert.equal(result.reactions, 5);
  assert.equal(result.comments, 4);
  assert.equal(result.shares, null);
  assert.equal(result.source, 'TELEGRAM_PUBLIC_WEB_PREVIEW');
});

test('missing view evidence fails closed', () => {
  const html = '<div class="tgme_widget_message" data-post="r_form/79"><span>post</span></div>';
  assert.throws(() => parsePost(html, 'r_form', '79'), /VIEWS_NOT_OBSERVED/);
});

test('24h checkpoint is written only inside its observation window', () => {
  assert.equal(checkpoint(23.99, {views_24h: ''}), '');
  assert.equal(checkpoint(24, {views_24h: ''}), '24H');
  assert.equal(checkpoint(35.99, {views_24h: ''}), '24H');
  assert.equal(checkpoint(36, {views_24h: ''}), '');
});

test('missed 24h observation is never backfilled from a later counter', () => {
  assert.equal(checkpoint(73, {views_24h: '', views_72h: ''}), '72H');
  const result = patch('72H', {views: 1500, reactions: 7, comments: null, shares: null, source: 'TELEGRAM_PUBLIC_WEB_PREVIEW'});
  assert.equal(result.Views_72H, 1500);
  assert.equal(result.Reactions_72H, 7);
  assert.equal(result.Views_24H, undefined);
  assert.equal(result.Comments_72H, undefined);
  assert.equal(result.Shares_72H, undefined);
});

test('existing checkpoint is immutable and rerun becomes no-op for that window', () => {
  assert.equal(checkpoint(25, {views_24h: '900'}), '');
  assert.equal(checkpoint(74, {views_24h: '900', views_72h: '1200'}), '');
  assert.equal(checkpoint(170, {views_7d: '2000'}), '');
});
