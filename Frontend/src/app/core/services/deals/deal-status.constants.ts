export type { DealPipelineStatus } from './deal-pipeline.constants';
export {
  DEFAULT_DEAL_PIPELINE_STATUS,
  FALLBACK_DEAL_STATUS_OPTIONS,
  dealStatusCssKind,
  isDealActivePipeline,
  isDealClosed,
  isDealClosedLost,
  isDealClosedWon,
  resolveDealStatusForApi,
  resolveDealStatusLabel,
  resolveDealStatusSelectValue,
} from './deal-pipeline.constants';
export { defaultDealStatusLabel } from './deal-pipeline-config.util';
