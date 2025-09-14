import { Metadata } from 'next';
import { PartnerRegistrationForm } from '@/components/partner-registration-form';

export const metadata: Metadata = {
  title: 'Partner Registration | Join Our Partner Program',
  description: 'Apply to become a partner and start earning commissions through our referral program.',
};

export default function PartnerRegistrationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Join Our Partner Program
            </h1>
            <p className="text-lg text-gray-600">
              Start earning commissions by referring new customers to our platform. 
              Fill out the application below to get started.
            </p>
          </div>

          {/* Registration Form */}
          <div className="bg-white rounded-lg shadow-md p-8">
            <PartnerRegistrationForm />
          </div>

          {/* Benefits Section */}
          <div className="mt-12 bg-white rounded-lg shadow-md p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Why Partner With Us?</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm">✓</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Competitive Commissions</h3>
                  <p className="text-gray-600 text-sm">Earn up to 30% commission on every referral</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm">✓</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Multi-Level Rewards</h3>
                  <p className="text-gray-600 text-sm">Earn from your referrals' referrals too</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm">✓</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Marketing Support</h3>
                  <p className="text-gray-600 text-sm">Access to marketing materials and resources</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm">✓</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Real-Time Tracking</h3>
                  <p className="text-gray-600 text-sm">Monitor your referrals and earnings live</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}