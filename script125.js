angular
    .module('webApp')
    .controller('tableroEsController', ['$scope', '$location', '$window', '$uibModal', 'session', 'SITE', tableroController]);

function tableroController($scope, $location, $window, $uibModal, session, SITE) {
    var vm = this;

    
    var tramite = session.get(0);
    if (typeof (tramite) === "undefined") {
        $location.path('/');
        return;
    }

  

    vm.ReimprimirFormularios = function () {
        var data = {};
        data.NroPrecarga = vm.nroPrecarga;

        var tramite = session.get(0);

        modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/escribania/reimpresion.html',
            controller: ['$scope', '$uibModalInstance', 'session', 'Formulario08D', function ($modalscope, $uibModalInstance, session, Formulario08D) {
                var vmModal = this;

                
                Formulario08D.recuperar({ nroPrecarga: data.NroPrecarga, cuit: tramite.escribanoCuit }, function (data1) {
                    vmModal.Formularios = data1.Formularios;
                });

                vmModal.imprimirForm = function (key) {

                    if (vmModal.Formularios[key].indexOf("<html>") >= 0) {
                        var leftPosition = (screen.width) ? (screen.width - 1250) / 2 : 0;
                        var topPosition = (screen.height) ? (screen.height - 1250) / 2 : 0;

                        var settings = "toolbar=no,scrollbars=yes,location=no,statusbar=no,menubar=no,resizable=yes,width=1050px, height=900px,left=" + leftPosition + "px,innerLeft=" + leftPosition + "px,top=" + topPosition + "px,innerTop=" + topPosition + "px";
                        var url = "app/modules/escribania/impresionFormulario.html";

                        popUp = window.open(url, "_blank", settings);
                        popUp.DataToShare = vmModal.Formularios[key];
                        popUp.focus();
                    } else {
                        var byteCharacters = atob(vmModal.Formularios[key]);
                        var byteNumbers = new Array(byteCharacters.length);
                        for (var i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        var byteArray = new Uint8Array(byteNumbers);
                        var file = new Blob([byteArray], { type: 'application/pdf;base64' });
                        var fileURL = URL.createObjectURL(file);
                        window.open(fileURL);
                    }
                }

                vmModal.terminar = function () {
                    $uibModalInstance.dismiss();
                }

                vmModal.close = function () {
                    $uibModalInstance.dismiss('cancel');
                }

                registerInterceptorValidationSummary($modalscope, vmModal);

            }],
            controllerAs: 'reimpresionCtrl',
            backdrop: 'static',
            resolve: {
                session: function () {
                    return session;
                }
            }
        });
        modalInstance.result.then(function (rta) {
            vm.nroPrecarga = "";
            $location.path("/escribanias/tablero");
        }, function () {
                
                              $location.path("/");

        });
    }

    registerInterceptorValidationSummary($scope, vm, $window);

}