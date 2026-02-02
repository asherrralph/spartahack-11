import { motion, AnimatePresence } from 'framer-motion';

interface Attack {
  id: string | number;
  time: string;
  amount: string;
  loss: string;
}

interface RecentAttacksProps {
  attacks: Attack[];
}

const RecentAttacks: React.FC<RecentAttacksProps> = ({ attacks }) => (
  <div className="space-y-3">
    <AnimatePresence mode="popLayout">
      {attacks.map((attack) => (
        <motion.div
          key={attack.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg flex justify-between items-center"
        >
          <div>
            <div className="text-red-400 font-bold text-sm">SANDWICH DETECTED</div>
            <div className="text-xs text-gray-500">{attack.time} ago</div>
          </div>
          <div className="text-right">
            <div className="text-white font-mono">{attack.amount}</div>
            <div className="text-xs text-red-500/80">-{attack.loss} Lost</div>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);
export default RecentAttacks;