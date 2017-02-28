angular.module('BlocksApp').controller('RichlistController', function($stateParams, $rootScope, $scope, $http) {

    // Page Title handling
    $rootScope.isHome = true; // hide the page title (comment this out to show it)
    $rootScope.$state.current.data["pageSubTitle"] = "The Richest Musicoin Accounts"; // subtitle

    // Properties
    $scope.allAccounts = ["no account data"];
    $scope.listData = ["no list data"];
  
    // Initialization
    $scope.$on('$viewContentLoaded', function() {
        //App.initAjax(); // ajax version
        $scope.getAllAccounts(); // angular version
    });
    

    // make http POST call to /allaccounts to get the list of all accounts to getBalance() on
    $scope.getAllAccounts = function() {        

        $http.post('/allaccounts', {})
        .then(function(res){
            $scope.allAccounts = res.data;
            $scope.getBalancesForAccounts();
        });

    }

    // Get the balances for all the accounts
    $scope.getBalancesForAccounts = function() {

        $scope.listData = [];

        var bal = 1000;
        ($scope.allAccounts).forEach(function(a) {            
            $scope.listData.push({"address": a, "balance":  bal}); // testing only. replace with post below
            bal = bal + 1500; 
        });

        // order by balance
        $scope.listData = $scope.listData.sort(function(a, b) {
            return parseFloat(b.balance) - parseFloat(a.balance);
        });
        
        /* angular version
        $http.post('/web3relay', {"addr": a, "options": ["balance", "bytecode"]})
            .then(function(res){
                $scope.listData.push({a,res.balance});
            });
        */
    }


})
