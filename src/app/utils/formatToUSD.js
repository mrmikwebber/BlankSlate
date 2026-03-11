export function formatToUSD (balance) {
    // Round to cents first, then coerce -0 (or any sub-cent negative) to 0
    const rounded = Math.round((balance || 0) * 100) / 100;
    const normalized = rounded === 0 ? 0 : rounded;
    const newBal = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(normalized);
    return newBal
}