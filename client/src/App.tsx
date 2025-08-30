import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/utils/trpc';
import type { User } from '../../server/src/schema';

// App states for the user flow
type AppState = 'welcome' | 'signup' | 'phone-entry' | 'phone-verification' | 'thank-you';

interface SignUpData {
  email: string;
  first_name: string;
}

function App() {
  const [currentState, setCurrentState] = useState<AppState>('welcome');
  const [user, setUser] = useState<User | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Sign-up form state
  const [signUpData, setSignUpData] = useState<SignUpData>({
    email: '',
    first_name: ''
  });

  const clearError = useCallback(() => {
    if (error) setError(null);
  }, [error]);

  // Handle OAuth-style sign up
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const newUser = await trpc.createUser.mutate(signUpData);
      setUser(newUser);
      setCurrentState('phone-entry');
      // Reset sign-up form
      setSignUpData({ email: '', first_name: '' });
    } catch (err) {
      setError('Failed to create account. Please try again.');
      console.error('Sign-up error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Start phone verification
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const result = await trpc.startPhoneVerification.mutate({
        user_id: user.id,
        phone_number: phoneNumber
      });

      if (result.success) {
        setCurrentState('phone-verification');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Failed to send verification code. Please try again.');
      console.error('Phone verification start error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Verify phone code
  const handleCodeVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await trpc.verifyPhoneCode.mutate({
        user_id: user.id,
        verification_code: verificationCode
      });

      if (result.success && result.user) {
        setUser(result.user);
        setCurrentState('thank-you');
        // Clear sensitive data
        setVerificationCode('');
        setPhoneNumber('');
      } else {
        setError(result.message);
        setVerificationCode(''); // Clear incorrect code
      }
    } catch (err) {
      setError('Failed to verify code. Please try again.');
      setVerificationCode('');
      console.error('Code verification error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Resend verification code
  const handleResendCode = async () => {
    if (!user) return;
    
    setIsLoading(true);
    setError(null);

    try {
      await trpc.resendVerificationCode.mutate({ userId: user.id });
      setError(null);
      // Show success message temporarily
      const successMsg = 'Verification code sent again!';
      setError(successMsg);
      setTimeout(() => {
        if (error === successMsg) setError(null);
      }, 3000);
    } catch (err) {
      setError('Failed to resend code. Please try again.');
      console.error('Resend error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const renderWelcomePage = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">📱</span>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">Welcome!</CardTitle>
          <CardDescription className="text-lg text-gray-600 mt-2">
            Let's confirm your phone number
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => setCurrentState('signup')} 
            className="w-full py-6 text-lg font-medium bg-indigo-600 hover:bg-indigo-700"
            size="lg"
          >
            Sign Up
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const renderSignUpPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">Create Account</CardTitle>
          <CardDescription className="text-gray-600">
            Enter your details to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert className="mb-4 border-red-200 bg-red-50">
              <AlertDescription className="text-red-700">{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">First Name</label>
              <Input
                type="text"
                placeholder="Enter your first name"
                value={signUpData.first_name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  clearError();
                  setSignUpData((prev: SignUpData) => ({ ...prev, first_name: e.target.value }));
                }}
                required
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email Address</label>
              <Input
                type="email"
                placeholder="Enter your email"
                value={signUpData.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  clearError();
                  setSignUpData((prev: SignUpData) => ({ ...prev, email: e.target.value }));
                }}
                required
                className="h-12"
              />
            </div>
            <Button 
              type="submit" 
              disabled={isLoading} 
              className="w-full py-6 text-lg font-medium bg-indigo-600 hover:bg-indigo-700"
              size="lg"
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>
          <Button 
            variant="ghost" 
            onClick={() => setCurrentState('welcome')}
            className="w-full mt-2"
          >
            ← Back to Welcome
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const renderPhoneEntryPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">📞</span>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">Phone Number</CardTitle>
          <CardDescription className="text-gray-600">
            {user && `Hi ${user.first_name}!`} Enter your phone number to receive a verification code
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert className="mb-4 border-red-200 bg-red-50">
              <AlertDescription className="text-red-700">{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Phone Number</label>
              <Input
                type="tel"
                placeholder="+1234567890"
                value={phoneNumber}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  clearError();
                  setPhoneNumber(e.target.value);
                }}
                required
                className="h-12 text-lg"
              />
              <p className="text-xs text-gray-500">Please use international format (e.g., +1234567890)</p>
            </div>
            <Button 
              type="submit" 
              disabled={isLoading} 
              className="w-full py-6 text-lg font-medium bg-emerald-600 hover:bg-emerald-700"
              size="lg"
            >
              {isLoading ? 'Sending Code...' : 'Send Verification Code'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );

  const renderPhoneVerificationPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-violet-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">💬</span>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">Verify Code</CardTitle>
          <CardDescription className="text-gray-600">
            Enter the 6-digit code sent to {phoneNumber}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert className={`mb-4 ${error.includes('sent again') ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <AlertDescription className={error.includes('sent again') ? 'text-green-700' : 'text-red-700'}>
                {error}
              </AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleCodeVerification} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Verification Code</label>
              <Input
                type="text"
                placeholder="000000"
                value={verificationCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  clearError();
                  // Only allow numbers and limit to 6 digits
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setVerificationCode(value);
                }}
                required
                maxLength={6}
                className="h-12 text-lg text-center tracking-widest"
              />
            </div>
            <Button 
              type="submit" 
              disabled={isLoading || verificationCode.length !== 6} 
              className="w-full py-6 text-lg font-medium bg-violet-600 hover:bg-violet-700"
              size="lg"
            >
              {isLoading ? 'Verifying...' : 'Verify Code'}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Button 
              variant="ghost" 
              onClick={handleResendCode}
              disabled={isLoading}
              className="text-violet-600 hover:text-violet-700"
            >
              Didn't receive the code? Resend
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderThankYouPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-8">
          <div className="mx-auto mb-6 w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
            <span className="text-3xl">✅</span>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900 mb-4">
            Thank You!
          </CardTitle>
          <CardDescription className="text-lg text-gray-600">
            Your phone number has been successfully verified.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="mb-6 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
            <p className="text-sm text-emerald-700 font-medium">
              {user && `Welcome, ${user.first_name}! 🎉`}
            </p>
            <p className="text-sm text-emerald-600 mt-1">
              Your account is now fully set up.
            </p>
          </div>
          <Button 
            onClick={() => {
              // Reset the entire flow for demo purposes
              setCurrentState('welcome');
              setUser(null);
              setPhoneNumber('');
              setVerificationCode('');
              setSignUpData({ email: '', first_name: '' });
              setError(null);
            }}
            variant="outline"
            className="w-full"
          >
            Start Over (Demo)
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  // Render the appropriate page based on current state
  switch (currentState) {
    case 'welcome':
      return renderWelcomePage();
    case 'signup':
      return renderSignUpPage();
    case 'phone-entry':
      return renderPhoneEntryPage();
    case 'phone-verification':
      return renderPhoneVerificationPage();
    case 'thank-you':
      return renderThankYouPage();
    default:
      return renderWelcomePage();
  }
}

export default App;