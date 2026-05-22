export const sendCallLinkOption = async ({ navigatorObj, setStatusText }) => {
  const link = "https://call.quantx.local/session";
  if (navigatorObj?.clipboard?.writeText) await navigatorObj.clipboard.writeText(link);
  setStatusText("Call link copied.");
};
