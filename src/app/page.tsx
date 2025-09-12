import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, FileText, Users, AlertTriangle, Clock, CheckCircle, Shield, Brain, Zap } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="min-h-screen gradient-bg">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-16 animate-fade-in-up">
          <h1 className="text-5xl font-bold text-white mb-6">
            School Compliance AI Assistant
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
            Navigate complex disciplinary incident compliance requirements with 
            <span className="text-gradient font-semibold"> AI-powered guidance</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          <Card className="card-modern hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Active Incidents</CardTitle>
              <AlertTriangle className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">12</div>
              <p className="text-xs text-gray-400">
                +2 from last week
              </p>
            </CardContent>
          </Card>

          <Card className="card-modern hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Pending Actions</CardTitle>
              <Clock className="h-4 w-4 text-yellow-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">8</div>
              <p className="text-xs text-gray-400">
                3 overdue
              </p>
            </CardContent>
          </Card>

          <Card className="card-modern hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Compliance Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">94%</div>
              <p className="text-xs text-gray-400">
                +2% from last month
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <Card className="card-modern hover-lift">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-green-400" />
                Quick Actions
              </CardTitle>
              <CardDescription className="text-gray-400">
                Common tasks and workflows
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Link href="/incidents/new">
                <Button className="btn-primary w-full justify-start">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Report New Incident
                </Button>
              </Link>
              <Link href="/incidents">
                <Button className="btn-secondary w-full justify-start">
                  <FileText className="mr-2 h-4 w-4" />
                  View All Incidents
                </Button>
              </Link>
              <Link href="/policies">
                <Button className="btn-secondary w-full justify-start">
                  <Shield className="mr-2 h-4 w-4" />
                  Manage Policies
                </Button>
              </Link>
              <Link href="/chat">
                <Button className="btn-secondary w-full justify-start">
                  <Brain className="mr-2 h-4 w-4" />
                  AI Assistant Chat
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="card-modern hover-lift">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-400" />
                Recent Activity
              </CardTitle>
              <CardDescription className="text-gray-400">
                Latest updates and notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse-slow"></div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-white">New incident reported</p>
                    <p className="text-xs text-gray-400">Bullying incident - High priority</p>
                  </div>
                  <div className="text-xs text-gray-500">2m ago</div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse-slow"></div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-white">Action due soon</p>
                    <p className="text-xs text-gray-400">Investigation report due in 2 days</p>
                  </div>
                  <div className="text-xs text-gray-500">1h ago</div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse-slow"></div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-white">Policy updated</p>
                    <p className="text-xs text-gray-400">Title IX procedures v2.1</p>
                  </div>
                  <div className="text-xs text-gray-500">3h ago</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Features Section */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Built for School Administrators
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Leverage AI-powered compliance guidance to ensure proper incident handling and policy adherence
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="card-modern hover-lift text-center">
            <CardContent className="pt-6">
              <Shield className="h-12 w-12 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Privacy-First</h3>
              <p className="text-gray-400">
                All AI processing happens locally. No student data sent to external services.
              </p>
            </CardContent>
          </Card>

          <Card className="card-modern hover-lift text-center">
            <CardContent className="pt-6">
              <Brain className="h-12 w-12 text-blue-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">AI-Powered</h3>
              <p className="text-gray-400">
                Intelligent incident classification and policy-grounded recommendations.
              </p>
            </CardContent>
          </Card>

          <Card className="card-modern hover-lift text-center">
            <CardContent className="pt-6">
              <CheckCircle className="h-12 w-12 text-purple-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Compliance-Focused</h3>
              <p className="text-gray-400">
                Automated timeline monitoring and required action tracking.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}