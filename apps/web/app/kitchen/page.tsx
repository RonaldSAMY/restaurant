import { KitchenBoard } from './kitchen-board';

/** The Kitchen Board; anonymous callers end up on `/kitchen/login`. */
export default function KitchenPage() {
  return (
    <main className="wide">
      <KitchenBoard />
    </main>
  );
}
