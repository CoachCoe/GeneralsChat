'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle, Circle, Clock, ArrowLeft, Calendar } from 'lucide-react';
import Navbar from '@/components/Navbar';

// Mock to-do data (same as in the main todos page)
const mockTodos = [
  {
    id: 1,
    title: 'Review incident report #1234',
    description: 'Review the disciplinary incident report for student John Doe',
    dueDate: new Date('2024-01-15'),
    completed: false,
    priority: 'high'
  },
  {
    id: 2,
    title: 'Update school policies',
    description: 'Review and update the student handbook policies',
    dueDate: new Date('2024-01-20'),
    completed: false,
    priority: 'medium'
  },
  {
    id: 3,
    title: 'Parent meeting - Smith case',
    description: 'Schedule and conduct parent meeting for disciplinary case',
    dueDate: new Date('2024-01-12'),
    completed: true,
    priority: 'high'
  },
  {
    id: 4,
    title: 'Prepare compliance report',
    description: 'Compile monthly compliance report for district office',
    dueDate: new Date('2024-01-25'),
    completed: false,
    priority: 'medium'
  },
  {
    id: 5,
    title: 'Training session - New staff',
    description: 'Conduct disciplinary procedures training for new staff',
    dueDate: new Date('2024-01-18'),
    completed: false,
    priority: 'low'
  },
  {
    id: 6,
    title: 'Follow up - Investigation #5678',
    description: 'Follow up on ongoing investigation of bullying incident',
    dueDate: new Date('2024-01-14'),
    completed: false,
    priority: 'high'
  },
  {
    id: 7,
    title: 'Update incident database',
    description: 'Update the incident tracking database with recent cases',
    dueDate: new Date('2024-01-16'),
    completed: true,
    priority: 'low'
  },
  {
    id: 8,
    title: 'Review safety protocols',
    description: 'Review and update school safety protocols',
    dueDate: new Date('2024-01-22'),
    completed: false,
    priority: 'medium'
  }
];

type Todo = typeof mockTodos[0];

export default function TodoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [todo, setTodo] = useState<Todo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const todoId = parseInt(params.id as string);
    const foundTodo = mockTodos.find(t => t.id === todoId);
    setTodo(foundTodo || null);
    setLoading(false);
  }, [params.id]);

  const toggleTodo = () => {
    if (todo) {
      setTodo({ ...todo, completed: !todo.completed });
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const isOverdue = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todoDate = new Date(date);
    todoDate.setHours(0, 0, 0, 0);
    return todoDate < today;
  };

  const isDueToday = (date: Date) => {
    const today = new Date();
    const todoDate = new Date(date);
    return todoDate.toDateString() === today.toDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg">
        <Navbar />
        <div className="container mx-auto px-6 py-8">
          <div className="text-center">
            <div className="text-white">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!todo) {
    return (
      <div className="min-h-screen gradient-bg">
        <Navbar />
        <div className="container mx-auto px-6 py-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-4">Task Not Found</h1>
            <p className="text-gray-300 mb-8">The requested task could not be found.</p>
            <button
              onClick={() => router.push('/todos')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
              Back to To-Do List
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar />
      
      <div className="container mx-auto px-6 py-8">
        {/* Back Button */}
        <div className="max-w-4xl mx-auto mb-8">
          <button
            onClick={() => router.push('/todos')}
            className="inline-flex items-center gap-2 text-gray-300 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft size={20} />
            Back to To-Do List
          </button>
        </div>

        {/* Task Detail */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8">
            <div className="flex items-start gap-6">
              {/* Checkbox */}
              <button
                onClick={toggleTodo}
                className="mt-1 transition-colors"
              >
                {todo.completed ? (
                  <CheckCircle size={32} className="text-green-400" />
                ) : (
                  <Circle size={32} className="text-gray-400 hover:text-white" />
                )}
              </button>

              {/* Content */}
              <div className="flex-1">
                <h1 className={`text-3xl font-bold mb-4 ${
                  todo.completed ? 'line-through text-gray-400' : 'text-white'
                }`}>
                  {todo.title}
                </h1>
                
                <p className={`text-lg mb-6 ${
                  todo.completed ? 'text-gray-500' : 'text-gray-300'
                }`}>
                  {todo.description}
                </p>

                {/* Due Date */}
                <div className="flex items-center gap-3 text-lg">
                  <Calendar size={20} className="text-gray-400" />
                  <span className={`${
                    isOverdue(todo.dueDate) && !todo.completed
                      ? 'text-red-400 font-semibold'
                      : isDueToday(todo.dueDate) && !todo.completed
                      ? 'text-yellow-400 font-semibold'
                      : todo.completed
                      ? 'text-gray-500'
                      : 'text-gray-400'
                  }`}>
                    {isOverdue(todo.dueDate) && !todo.completed
                      ? `Overdue - ${formatDate(todo.dueDate)}`
                      : isDueToday(todo.dueDate) && !todo.completed
                      ? `Due Today - ${formatDate(todo.dueDate)}`
                      : `Due ${formatDate(todo.dueDate)}`
                    }
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="mt-8 flex gap-4">
                  <button
                    onClick={toggleTodo}
                    className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                      todo.completed
                        ? 'bg-gray-500 hover:bg-gray-600 text-white'
                        : 'bg-green-500 hover:bg-green-600 text-white'
                    }`}
                  >
                    {todo.completed ? 'Mark as Incomplete' : 'Mark as Complete'}
                  </button>
                  
                  <button
                    onClick={() => router.push('/todos')}
                    className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
                  >
                    Back to List
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
