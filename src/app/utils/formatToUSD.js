export function formatToUSD (balance) {
    const newBal = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(balance);
    return newBal
}