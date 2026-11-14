// Today's local calendar date as YYYY-MM-DD. toISOString() gives the UTC date,
// which is still yesterday in India between 00:00 and 05:30.
export const todayYmd = () => new Date().toLocaleDateString('en-CA');
