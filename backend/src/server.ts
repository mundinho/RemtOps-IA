import { orchestrator } from './agents/orchestrator/Orchestrator.js';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { eventBus } from './events/eventBus.js';
import { llm } from './llm/index.js';

orchestrator.register();

createApp().listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}/api`);
  console.log(`LLM provider: ${llm.name} (${llm.model})`);
  // Workflow state lives in the database, so anything interrupted by a restart picks up where it stopped.
  void orchestrator.resumeInterrupted();

  // Proactive monitoring: agents act without anyone asking (in production: a cron/queue scheduler).
  if (env.MONITORING_INTERVAL_MS > 0) {
    setInterval(() => eventBus.emit('monitoring.tick', { trigger: 'schedule' }), env.MONITORING_INTERVAL_MS);
    console.log(`Monitoring cycle every ${Math.round(env.MONITORING_INTERVAL_MS / 60_000)} min`);
  }
});
