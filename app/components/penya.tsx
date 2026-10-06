const penyaNumber = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatPenya(value: number) {
  return penyaNumber.format(value);
}

export function PenyaCoin() {
  return <span className="penya-coin" aria-hidden="true">P</span>;
}

export function PenyaAmount({ value }: { value: number }) {
  return <span className="penya-amount" aria-label={`${formatPenya(value)} Penya`}><PenyaCoin /><span>{formatPenya(value)}</span></span>;
}
