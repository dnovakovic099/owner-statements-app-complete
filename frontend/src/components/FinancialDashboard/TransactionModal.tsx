import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Input } from '../ui/input';
import { Search, X } from 'lucide-react';

export interface Transaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  category: string;
  property: string;
  type: 'income' | 'expense';
}

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  title?: string;
}

const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  transactions,
  title = 'Transactions',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProperty, setFilterProperty] = useState('');

  // Get unique categories and properties for filters
  const categories = Array.from(new Set(transactions.map((t) => t.category))).sort();
  const properties = Array.from(new Set(transactions.map((t) => t.property))).sort();

  // Filter transactions
  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch =
      searchTerm === '' ||
      transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.property.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = filterCategory === '' || transaction.category === filterCategory;
    const matchesProperty = filterProperty === '' || transaction.property === filterProperty;

    return matchesSearch && matchesCategory && matchesProperty;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const totalIncome = filteredTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = filteredTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          {/* Property Filter */}
          <select
            value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Properties</option>
            {properties.map((property) => (
              <option key={property} value={property}>
                {property}
              </option>
            ))}
          </select>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 py-3 bg-gray-50 rounded-lg px-4">
          <div>
            <p className="text-xs text-gray-600">Total Income</p>
            <p className="text-lg font-semibold text-green-600">{formatCurrency(totalIncome)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Total Expenses</p>
            <p className="text-lg font-semibold text-red-600">{formatCurrency(totalExpenses)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Net</p>
            <p
              className={`text-lg font-semibold ${
                totalIncome - totalExpenses >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatCurrency(totalIncome - totalExpenses)}
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[150px]">Category</TableHead>
                <TableHead className="w-[150px]">Property</TableHead>
                <TableHead className="w-[130px] text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="text-sm text-gray-600">
                      {formatDate(transaction.date)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{transaction.description}</TableCell>
                    <TableCell className="text-sm text-gray-600">{transaction.category}</TableCell>
                    <TableCell className="text-sm text-gray-600">{transaction.property}</TableCell>
                    <TableCell
                      className={`text-sm font-semibold text-right ${
                        transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {transaction.type === 'income' ? '+' : '-'}
                      {formatCurrency(Math.abs(transaction.amount))}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                    No transactions found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t text-sm text-gray-600">
          Showing {filteredTransactions.length} of {transactions.length} transactions
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionModal;
