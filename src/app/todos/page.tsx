'use client';

import { useState } from 'react';
import { CheckCircle, Circle, Calendar, Clock, Filter, Plus } from 'lucide-react';
import Navbar from '@/components/Navbar';

// Mock to-do data
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
type FilterType = 'all' | 'todo' | 'completed';
type DueFilter = 'all' | 'today' | 'week';

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>(mockTodos);
  const [filter, setFilter] = useState<FilterType>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');

  const toggleTodo = (id: number) => {
    setTodos(todos.map(todo => 
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const getFilteredTodos = () => {
    let filtered = todos;

    // Apply completion filter
    if (filter === 'todo') {
      filtered = filtered.filter(todo => !todo.completed);
    } else if (filter === 'completed') {
      filtered = filtered.filter(todo => todo.completed);
    }

    // Apply due date filter
    const today = new Date();
    const weekFromNow = new Date();
    weekFromNow.setDate(today.getDate() + 7);

    if (dueFilter === 'today') {
      filtered = filtered.filter(todo => {
        const todoDate = new Date(todo.dueDate);
        return todoDate.toDateString() === today.toDateString();
      });
    } else if (dueFilter === 'week') {
      filtered = filtered.filter(todo => {
        const todoDate = new Date(todo.dueDate);
        return todoDate >= today && todoDate <= weekFromNow;
      });
    }

    return filtered.sort((a, b) => {
      // Sort by due date, then by priority
      const dateA = new Date(a.dueDate);
      const dateB = new Date(b.dueDate);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority as keyof typeof priorityOrder] - priorityOrder[a.priority as keyof typeof priorityOrder];
    });
  };


  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
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

  const filteredTodos = getFilteredTodos();

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar />
      
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">To-Do List</h1>
          <p className="text-xl text-gray-300">Manage your tasks and stay on top of deadlines</p>
        </div>

        {/* Filters */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            {/* Completion Filter */}
            <div className="flex items-center gap-2">
              <Filter size={20} className="text-gray-300" />
              <span className="text-gray-300 font-medium">Show:</span>
              <div className="flex gap-2">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'todo', label: 'To-Do' },
                  { key: 'completed', label: 'Completed' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key as FilterType)}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                      backgroundColor: filter === key ? '#3b82f6' : 'transparent',
                      color: filter === key ? 'white' : '#d1d5db',
                      border: '1px solid #4b5563',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      if (filter !== key) {
                        (e.target as HTMLElement).style.backgroundColor = '#374151';
                        (e.target as HTMLElement).style.color = 'white';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (filter !== key) {
                        (e.target as HTMLElement).style.backgroundColor = 'transparent';
                        (e.target as HTMLElement).style.color = '#d1d5db';
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Due Date Filter */}
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-gray-300" />
              <span className="text-gray-300 font-medium">Due:</span>
              <div className="flex gap-2">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'today', label: 'Today' },
                  { key: 'week', label: 'This Week' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setDueFilter(key as DueFilter)}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                      backgroundColor: dueFilter === key ? '#10b981' : 'transparent',
                      color: dueFilter === key ? 'white' : '#d1d5db',
                      border: '1px solid #4b5563',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      if (dueFilter !== key) {
                        (e.target as HTMLElement).style.backgroundColor = '#374151';
                        (e.target as HTMLElement).style.color = 'white';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (dueFilter !== key) {
                        (e.target as HTMLElement).style.backgroundColor = 'transparent';
                        (e.target as HTMLElement).style.color = '#d1d5db';
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Todo List */}
        <div className="max-w-4xl mx-auto">
          {filteredTodos.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📝</div>
              <h3 className="text-2xl font-semibold text-white mb-2">No tasks found</h3>
              <p className="text-gray-300">
                {filter === 'todo' && dueFilter === 'all' 
                  ? "You're all caught up! No pending tasks."
                  : "No tasks match your current filters."
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTodos.map((todo) => (
                <div
                  key={todo.id}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #4b5563',
                    borderRadius: '0.5rem',
                    padding: '1.5rem',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                    opacity: todo.completed ? 0.75 : 1
                  }}
                  onClick={() => window.location.href = `/todos/${todo.id}`}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = '#1f2937';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = 'transparent';
                  }}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTodo(todo.id);
                      }}
                      style={{
                        marginTop: '0.25rem',
                        transition: 'colors 0.2s',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      {todo.completed ? (
                        <CheckCircle size={24} className="text-green-400" />
                      ) : (
                        <Circle size={24} className="text-gray-400 hover:text-white" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className={`text-lg font-semibold mb-2 ${
                            todo.completed ? 'line-through text-gray-400' : 'text-white'
                          }`}>
                            {todo.title}
                          </h3>
                          <p className={`text-sm mb-3 ${
                            todo.completed ? 'text-gray-500' : 'text-gray-300'
                          }`}>
                            {todo.description}
                          </p>
                        </div>
                      </div>

                      {/* Due Date */}
                      <div className="flex items-center gap-2 text-sm">
                        <Clock size={16} className="text-gray-400" />
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add New Task Button */}
        <div className="max-w-4xl mx-auto mt-8 text-center">
          <button 
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              fontWeight: '600',
              borderRadius: '0.5rem',
              transition: 'all 0.2s',
              border: 'none',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.backgroundColor = '#2563eb';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.backgroundColor = '#3b82f6';
            }}
          >
            <Plus size={20} />
            Add New Task
          </button>
        </div>
      </div>
    </div>
  );
}
