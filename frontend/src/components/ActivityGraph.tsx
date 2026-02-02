import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';

interface ActivityGraphProps {
  color: string;
  data: Array<{ activity: number }>;
}

const ActivityGraph: React.FC<ActivityGraphProps> = ({ color, data }) => (
  <div className="h-32 w-full mt-4 bg-gray-900/40 rounded-lg p-2 border border-gray-800">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <Area 
          type="monotone" 
          dataKey="activity" 
          stroke={color} 
          fill={`${color}33`} 
          strokeWidth={2}
          isAnimationActive={false} // Better for real-time performance
        />
        <YAxis hide domain={[0, 100]} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);
export default ActivityGraph;