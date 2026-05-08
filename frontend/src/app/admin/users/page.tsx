'use client';

import { useState } from 'react';
import Sidebar from '@/components/shared/Sidebar';

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const users = [
    { id: '1', name: 'Ananya Sharma', email: 'ananya@college.edu', role: 'candidate', department: 'CS', status: 'active' },
    { id: '2', name: 'Rahul Verma', email: 'rahul@college.edu', role: 'student', department: 'ECE', status: 'active' },
    { id: '3', name: 'Priya Patel', email: 'priya@college.edu', role: 'candidate', department: 'ME', status: 'pending' },
    { id: '4', name: 'Arun Kumar', email: 'arun@college.edu', role: 'student', department: 'CE', status: 'active' },
    { id: '5', name: 'Sneha Reddy', email: 'sneha@college.edu', role: 'admin', department: 'CS', status: 'active' },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar role="admin" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">User Management</h1>
          <p className="text-surface-400">Manage voters, candidates, and administrators.</p>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field max-w-sm"
            id="user-search"
          />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input-field max-w-[200px]" id="role-filter">
            <option value="all">All Roles</option>
            <option value="student">Students</option>
            <option value="candidate">Candidates</option>
            <option value="admin">Admins</option>
          </select>
        </div>

        {/* Users Table */}
        <div className="glass-card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-700">
                <th className="text-left p-4 text-sm font-medium text-surface-400">Name</th>
                <th className="text-left p-4 text-sm font-medium text-surface-400">Email</th>
                <th className="text-left p-4 text-sm font-medium text-surface-400">Role</th>
                <th className="text-left p-4 text-sm font-medium text-surface-400">Department</th>
                <th className="text-left p-4 text-sm font-medium text-surface-400">Status</th>
                <th className="text-left p-4 text-sm font-medium text-surface-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-surface-800 hover:bg-surface-900/50 transition-colors">
                  <td className="p-4 text-surface-200">{user.name}</td>
                  <td className="p-4 text-surface-400 text-sm">{user.email}</td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded-full text-xs capitalize bg-primary-500/10 text-primary-300">
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4 text-surface-400">{user.department}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${user.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <button className="text-xs text-primary-400 hover:text-primary-300">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
