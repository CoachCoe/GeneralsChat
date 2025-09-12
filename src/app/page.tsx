import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, FileText, Users, AlertTriangle, Clock, CheckCircle, Shield, Brain, Zap } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="min-h-screen gradient-bg">
      <div className="container mx-auto px-6 py-16">
        <div className="text-center mb-20 animate-fade-in-up">
          <h1 className="text-6xl font-bold text-white mb-8 leading-tight">
            School Compliance AI Assistant
          </h1>
          <p className="text-2xl text-gray-300 max-w-4xl mx-auto leading-relaxed font-light">
            Navigate complex disciplinary incident compliance requirements with 
            <span className="text-gradient font-semibold"> AI-powered guidance</span>
          </p>
          <div className="mt-8 flex justify-center">
            <div className="w-24 h-1 bg-gradient-to-r from-green-400 to-blue-500 rounded-full"></div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <Card className="card-modern hover-lift group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-sm font-medium text-gray-300 uppercase tracking-wider">Active Incidents</CardTitle>
              <div className="p-2 rounded-lg bg-green-500/20 group-hover:bg-green-500/30 transition-colors">
                <AlertTriangle className="h-5 w-5 text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-white mb-2">12</div>
              <p className="text-sm text-gray-400 flex items-center">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                +2 from last week
              </p>
            </CardContent>
          </Card>

          <Card className="card-modern hover-lift group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-sm font-medium text-gray-300 uppercase tracking-wider">Pending Actions</CardTitle>
              <div className="p-2 rounded-lg bg-yellow-500/20 group-hover:bg-yellow-500/30 transition-colors">
                <Clock className="h-5 w-5 text-yellow-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-white mb-2">8</div>
              <p className="text-sm text-gray-400 flex items-center">
                <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>
                3 overdue
              </p>
            </CardContent>
          </Card>

          <Card className="card-modern hover-lift group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-sm font-medium text-gray-300 uppercase tracking-wider">Compliance Rate</CardTitle>
              <div className="p-2 rounded-lg bg-green-500/20 group-hover:bg-green-500/30 transition-colors">
                <CheckCircle className="h-5 w-5 text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-white mb-2">94%</div>
              <p className="text-sm text-gray-400 flex items-center">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                +2% from last month
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          <Card className="card-modern hover-lift">
            <CardHeader className="pb-6">
              <CardTitle className="text-2xl text-white flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-green-500/20">
                  <Zap className="h-6 w-6 text-green-400" />
                </div>
                Quick Actions
              </CardTitle>
              <CardDescription className="text-gray-400 text-lg">
                Common tasks and workflows
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/incidents/new">
                <Button className="btn-primary w-full justify-start text-left h-14 text-lg">
                  <PlusCircle className="mr-3 h-5 w-5" />
                  Report New Incident
                </Button>
              </Link>
              <Link href="/incidents">
                <Button className="btn-secondary w-full justify-start text-left h-12">
                  <FileText className="mr-3 h-4 w-4" />
                  View All Incidents
                </Button>
              </Link>
              <Link href="/policies">
                <Button className="btn-secondary w-full justify-start text-left h-12">
                  <Shield className="mr-3 h-4 w-4" />
                  Manage Policies
                </Button>
              </Link>
              <Link href="/chat">
                <Button className="btn-secondary w-full justify-start text-left h-12">
                  <Brain className="mr-3 h-4 w-4" />
                  AI Assistant Chat
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="card-modern hover-lift">
            <CardHeader className="pb-6">
              <CardTitle className="text-2xl text-white flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-blue-500/20">
                  <Clock className="h-6 w-6 text-blue-400" />
                </div>
                Recent Activity
              </CardTitle>
              <CardDescription className="text-gray-400 text-lg">
                Latest updates and notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center space-x-4 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse-slow"></div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-semibold text-white">New incident reported</p>
                    <p className="text-xs text-gray-400">Bullying incident - High priority</p>
                  </div>
                  <div className="text-xs text-gray-500 font-medium">2m ago</div>
                </div>
                <div className="flex items-center space-x-4 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse-slow"></div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-semibold text-white">Action due soon</p>
                    <p className="text-xs text-gray-400">Investigation report due in 2 days</p>
                  </div>
                  <div className="text-xs text-gray-500 font-medium">1h ago</div>
                </div>
                <div className="flex items-center space-x-4 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse-slow"></div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-semibold text-white">Policy updated</p>
                    <p className="text-xs text-gray-400">Title IX procedures v2.1</p>
                  </div>
                  <div className="text-xs text-gray-500 font-medium">3h ago</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Features Section */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-6">
            Built for School Administrators
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
            Leverage AI-powered compliance guidance to ensure proper incident handling and policy adherence
          </p>
          <div className="mt-6 flex justify-center">
            <div className="w-16 h-1 bg-gradient-to-r from-green-400 to-blue-500 rounded-full"></div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="card-modern hover-lift text-center group">
            <CardContent className="pt-8 pb-8">
              <div className="p-4 rounded-2xl bg-green-500/20 w-fit mx-auto mb-6 group-hover:bg-green-500/30 transition-colors">
                <Shield className="h-8 w-8 text-green-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Privacy-First</h3>
              <p className="text-gray-400 leading-relaxed">
                All AI processing happens locally. No student data sent to external services.
              </p>
            </CardContent>
          </Card>

          <Card className="card-modern hover-lift text-center group">
            <CardContent className="pt-8 pb-8">
              <div className="p-4 rounded-2xl bg-blue-500/20 w-fit mx-auto mb-6 group-hover:bg-blue-500/30 transition-colors">
                <Brain className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">AI-Powered</h3>
              <p className="text-gray-400 leading-relaxed">
                Intelligent incident classification and policy-grounded recommendations.
              </p>
            </CardContent>
          </Card>

          <Card className="card-modern hover-lift text-center group">
            <CardContent className="pt-8 pb-8">
              <div className="p-4 rounded-2xl bg-purple-500/20 w-fit mx-auto mb-6 group-hover:bg-purple-500/30 transition-colors">
                <CheckCircle className="h-8 w-8 text-purple-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Compliance-Focused</h3>
              <p className="text-gray-400 leading-relaxed">
                Automated timeline monitoring and required action tracking.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}