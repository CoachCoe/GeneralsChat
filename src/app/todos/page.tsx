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
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Navbar />

      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-apple-largetitle mb-4" style={{ color: 'var(--foreground)' }}>To-Do List</h1>
          <p className="text-apple-title3" style={{ color: 'var(--muted-foreground)' }}>Manage your tasks and stay on top of deadlines</p>
        </div>

        {/* Filters */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            {/* Completion Filter */}
            <div className="flex items-center gap-2">
              <Filter size={20} style={{ color: 'var(--muted-foreground)' }} />
              <span className="text-apple-body font-medium" style={{ color: 'var(--foreground)' }}>Show:</span>
              <div className="flex gap-2">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'todo', label: 'To-Do' },
                  { key: 'completed', label: 'Completed' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key as FilterType)}
                    className={filter === key ? 'btn-apple-primary' : 'btn-apple-secondary'}
                    style={{
                      minHeight: '36px',
                      padding: '0 var(--spacing-4)',
                      fontSize: '15px'
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Due Date Filter */}
            <div className="flex items-center gap-2">
              <Calendar size={20} style={{ color: 'var(--muted-foreground)' }} />
              <span className="text-apple-body font-medium" style={{ color: 'var(--foreground)' }}>Due:</span>
              <div className="flex gap-2">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'today', label: 'Today' },
                  { key: 'week', label: 'This Week' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setDueFilter(key as DueFilter)}
                    className={dueFilter === key ? 'btn-apple-primary' : 'btn-apple-secondary'}
                    style={{
                      minHeight: '36px',
                      padding: '0 var(--spacing-4)',
                      fontSize: '15px'
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
            <div className="text-center" style={{ padding: 'var(--spacing-8) 0' }}>
              <div style={{ fontSize: '64px', marginBottom: 'var(--spacing-4)' }}>📝</div>
              <h3 className="text-apple-title2 mb-2" style={{ color: 'var(--foreground)' }}>No tasks found</h3>
              <p className="text-apple-body" style={{ color: 'var(--muted-foreground)' }}>
                {filter === 'todo' && dueFilter === 'all'
                  ? "You're all caught up! No pending tasks."
                  : "No tasks match your current filters."
                }
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
              {filteredTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="card-apple"
                  style={{
                    padding: 'var(--spacing-6)',
                    cursor: 'pointer',
                    opacity: todo.completed ? 0.7 : 1,
                    transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)'
                  }}
                  onClick={() => window.location.href = `/todos/${todo.id}`}
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
                        <CheckCircle size={24} style={{ color: 'var(--success)' }} />
                      ) : (
                        <Circle size={24} style={{ color: 'var(--muted-foreground)' }} />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-apple-title3 font-semibold mb-2" style={{
                            color: todo.completed ? 'var(--muted-foreground)' : 'var(--foreground)',
                            textDecoration: todo.completed ? 'line-through' : 'none'
                          }}>
                            {todo.title}
                          </h3>
                          <p className="text-apple-body mb-3" style={{
                            color: todo.completed ? 'var(--muted-foreground)' : 'var(--foreground)',
                            opacity: todo.completed ? 0.6 : 0.8
                          }}>
                            {todo.description}
                          </p>
                        </div>
                      </div>

                      {/* Due Date */}
                      <div className="flex items-center gap-2 text-apple-footnote">
                        <Clock size={16} style={{ color: 'var(--muted-foreground)' }} />
                        <span style={{
                          color: isOverdue(todo.dueDate) && !todo.completed
                            ? 'var(--destructive)'
                            : isDueToday(todo.dueDate) && !todo.completed
                            ? 'var(--warning)'
                            : 'var(--muted-foreground)',
                          fontWeight: (isOverdue(todo.dueDate) || isDueToday(todo.dueDate)) && !todo.completed ? 600 : 400
                        }}>
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
          <button className="btn-apple-primary" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)'
          }}>
            <Plus size={20} />
            Add New Task
          </button>
        </div>
      </div>
    </div>
  );
}
