import { useEffect, useState } from 'react';
import { fetchEdaSummary } from '../services';

/** Total LaTeX formulas from the latest published EDA artifact (0 until it loads). */
export function useEdaFormulas(): number {
  const [formulas, setFormulas] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchEdaSummary()
      .then((eda) => { if (alive) setFormulas(eda?.dataset_overview?.total_math_formulas ?? 0); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return formulas;
}
