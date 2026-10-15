// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys) and returns the hub, so index.js stays a few lines and the tests
// drive the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { createHub } from './hub.js';
import { TEXT } from './i18n.js';
import { createIssueLog } from './issues.js';
import { SCENE_ACTIONS } from './scenes.js';
import { WIDGET_KEY, createWidget } from './widgets.js';

const logger = createLogger({ name: 'app' });

export const ACTION_KEYS = { TEST_AND_REFRESH: 'test_and_refresh' };

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: dataDir, fetch, timers, now
 */
export function registerHandlers(gladys, options = {}) {
  const hub = createHub({ gladys, ...options });
  const widget = createWidget(gladys, hub, createIssueLog(createLogger({ name: 'widget' })));

  // --- Discovery: the Discovery tab asks for the lists ---------------------------
  gladys.onScanRequest(async () => {
    logger.info('Discovery requested: reading the OurGroceries lists');
    await hub.scan();
  });

  // --- Polling ---------------------------------------------------------------------
  // The hub's timer does the work; the core's onPoll is the fallback, and a
  // device just added gets its states at once.
  gladys.onPoll((device) => hub.pollFromCore(device));
  gladys.onDeviceCreated((device) => hub.deviceCreated(device));
  gladys.onDeviceUpdated((device) => hub.deviceCreated(device));

  // --- Configuration screen action -------------------------------------------------
  gladys.onAction(ACTION_KEYS.TEST_AND_REFRESH, async () => {
    logger.info('Action: test the connection and refresh');
    return hub.testAndRefresh();
  });

  // --- Scene actions ------------------------------------------------------------------
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(hub, fields));
  }

  // --- Dashboard widget ---------------------------------------------------------------
  gladys.onWidgetGet(WIDGET_KEY, (request) => widget.get(request));
  gladys.onWidgetAction(WIDGET_KEY, (actionKey, params, context) =>
    widget.action(actionKey, params, context),
  );

  // --- Configuration ------------------------------------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('Configuration updated');
    await hub.configure(normalizeConfig(newConfig));
  });

  // --- Connection lifecycle -------------------------------------------------------------
  // The SDK logs the WebSocket lifecycle itself.
  gladys.on('connected', async () => {
    try {
      await hub.configure(normalizeConfig(await gladys.getConfig()));
    } catch (err) {
      logger.error(`Post-connection initialization failed (${err.message})`);
      await gladys.setConnectionStatus(false, TEXT.initFailed).catch(() => {});
    }
  });

  return {
    hub,
    widget,
    stop() {
      hub.stop();
    },
  };
}
