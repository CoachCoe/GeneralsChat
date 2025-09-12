import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, FileText, Users, AlertTriangle, Clock, CheckCircle, Shield, Brain, Zap } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="min-h-screen gradient-bg">
      <div className="container mx-auto px-6 py-16">
        <div className="text-center mb-16 animate-fade-in-up">
          <h1 className="text-6xl font-bold text-white mb-8 leading-tight">
            General Chat
          </h1>
          <p className="text-2xl text-gray-300 max-w-4xl mx-auto leading-relaxed font-light">
            Chat with the General to navigate complex disciplinary incident compliance requirements with 
            <span className="text-gradient font-semibold"> AI-powered guidance</span>
          </p>
          <div className="mt-8 flex justify-center">
            <div className="w-24 h-1 bg-gradient-to-r from-green-400 to-blue-500 rounded-full"></div>
          </div>
        </div>

        {/* Main AI Chat Interface */}
        <div className="max-w-4xl mx-auto mb-16">
          <Card className="card-modern hover-lift">
            <CardHeader className="text-center pb-8">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-green-500/20 to-blue-500/20 w-fit mx-auto mb-6">
                <Brain className="h-12 w-12 text-green-400" />
              </div>
              <CardTitle className="text-3xl text-white mb-4">
                Chat with the General
              </CardTitle>
              <CardDescription className="text-xl text-gray-400 max-w-2xl mx-auto">
                Describe your incident and let the General guide you through the compliance process step by step
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Link href="/chat">
                <Button className="btn-primary w-full h-16 text-xl font-semibold">
                  <Brain className="mr-4 h-6 w-6" />
                  Start Chat with the General
                </Button>
              </Link>
              <div className="text-center">
                <p className="text-sm text-gray-500">
                  The General will ask questions, classify incidents, and ensure compliance
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <Link href="/incidents">
            <Card className="card-modern hover-lift group cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-sm font-medium text-gray-300 uppercase tracking-wider">View Incidents</CardTitle>
                <div className="p-2 rounded-lg bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
                  <FileText className="h-5 w-5 text-blue-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white mb-2">12 Active</div>
                <p className="text-sm text-gray-400 flex items-center">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                  Manage existing cases
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/policies">
            <Card className="card-modern hover-lift group cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-sm font-medium text-gray-300 uppercase tracking-wider">Manage Policies</CardTitle>
                <div className="p-2 rounded-lg bg-purple-500/20 group-hover:bg-purple-500/30 transition-colors">
                  <Shield className="h-5 w-5 text-purple-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white mb-2">8 Pending</div>
                <p className="text-sm text-gray-400 flex items-center">
                  <span className="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
                  Update compliance rules
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/incidents/new">
            <Card className="card-modern hover-lift group cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-sm font-medium text-gray-300 uppercase tracking-wider">Quick Report</CardTitle>
                <div className="p-2 rounded-lg bg-green-500/20 group-hover:bg-green-500/30 transition-colors">
                  <PlusCircle className="h-5 w-5 text-green-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white mb-2">New Case</div>
                <p className="text-sm text-gray-400 flex items-center">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Start incident report
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Footer Section */}
        <div className="text-center mt-20 pt-8 border-t border-white/10">
          <h3 className="text-lg font-semibold text-white mb-3">
            Built for School Administrators
          </h3>
          <p className="text-sm text-gray-400 max-w-2xl mx-auto mb-6">
            Chat with the General for AI-powered compliance guidance and proper incident handling
          </p>
          <div className="flex justify-center space-x-8 text-xs text-gray-500">
            <span className="flex items-center">
              <Shield className="h-3 w-3 mr-1 text-green-400" />
              Privacy-First
            </span>
            <span className="flex items-center">
              <Brain className="h-3 w-3 mr-1 text-blue-400" />
              General-Powered
            </span>
            <span className="flex items-center">
              <CheckCircle className="h-3 w-3 mr-1 text-purple-400" />
              Compliance-Focused
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}