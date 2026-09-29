angular
    .module('webApp')
    .controller('mostrarPdfController', ['$scope', '$http', '$window', '$routeParams', '$sce', mostrarPdfController]);

function mostrarPdfController($scope, $http, $window, $routeParams, $sce) {
    var vm = this;

    var url = 'api/consultaEstado/' + $routeParams.t + '/' + $routeParams.rs + '/' + $routeParams.nt + '/' + $routeParams.ncw + '/false';
    console.log(url);
    var isIE = function () {
        return typeof navigator !== "undefined" &&
            (/MSIE /.test(navigator.userAgent) || (navigator.appName === 'Netscape' && /Trident\/.*rv:([0-9]{1,}[\.0-9]{0,})/.test(navigator.userAgent)));
    }

    vm.datauri = !isIE();

    $http.get(url, { responseType: 'arraybuffer' })
        .then(function (response) {
            $scope.file = new Blob([response.data], { type: 'application/pdf' });
            //var url1 = $window.URL || $window.webkitURL;
            if (vm.datauri) {
                var fileUrl = URL.createObjectURL($scope.file);
                $scope.pdfContent = $sce.trustAsResourceUrl(fileUrl);
            }
        }); 
}