#include "Processes.r"

/* Keep serving the serial port while other apps are in front. */
resource 'SIZE' (-1) {
  reserved,
  acceptSuspendResumeEvents,
  reserved,
  canBackground,
  doesActivateOnFGSwitch,
  backgroundAndForeground,
  dontGetFrontClicks,
  ignoreChildDiedEvents,
  is32BitCompatible,
  notHighLevelEventAware,
  onlyLocalHLEvents,
  notStationeryAware,
  dontUseTextEditServices,
  reserved,
  reserved,
  reserved,
  512 * 1024,
  320 * 1024
};
